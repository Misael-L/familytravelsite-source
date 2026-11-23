"""Private owned-fixture transport. Docker Engine Unix socket; no network or published port."""
import http.client,socket,json,struct
from pathlib import Path
SOCKET=str(Path.home()/'.docker/run/docker.sock');VERSION='/v1.47'
class EngineConnection(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(self.timeout);self.sock.connect(SOCKET)
def request(method,path,data=None):
 c=EngineConnection('localhost',timeout=40)
 try:
  c.request(method,VERSION+path,body=None if data is None else json.dumps(data),headers={'Content-Type':'application/json'});r=c.getresponse();b=r.read();assert r.status in[200,201],r.status;return json.loads(b)
 finally:c.close()
def exec_input(container,args,data,timeout=40):
 e=request('POST','/containers/'+container+'/exec',{'AttachStdin':True,'AttachStdout':True,'AttachStderr':True,'Tty':False,'Cmd':args});eid=e['Id'];body=json.dumps({'Detach':False,'Tty':False}).encode();s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);s.settimeout(timeout);s.connect(SOCKET)
 try:
  s.sendall(('POST '+VERSION+'/exec/'+eid+'/start HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Type: application/json\r\nContent-Length: '+str(len(body))+'\r\n\r\n').encode()+body)
  b=b''
  while b'\r\n\r\n'not in b:b+=s.recv(4096)
  head,raw=b.split(b'\r\n\r\n',1);assert head.startswith(b'HTTP/1.1 101'),head.splitlines()[0]
  s.sendall(data.encode());s.shutdown(socket.SHUT_WR)
  while True:
   chunk=s.recv(65536)
   if not chunk:break
   raw+=chunk
 finally:s.close()
 out=[];err=[]
 while raw:
  assert len(raw)>=8,'short engine frame';stream=raw[0];n=struct.unpack('>I',raw[4:8])[0];assert len(raw)>=8+n;payload=raw[8:8+n];raw=raw[8+n:];(out if stream==1 else err).append(payload)
 state=request('GET','/exec/'+eid+'/json');assert not state['Running'];return state['ExitCode'],b''.join(out).decode(),b''.join(err).decode()
