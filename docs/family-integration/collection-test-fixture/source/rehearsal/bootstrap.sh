set -eu
chmod 700 /var/lib/postgresql/data
if [ ! -s /var/lib/postgresql/data/PG_VERSION ]; then
initdb -D /var/lib/postgresql/data -U family_restore_operator --auth-local=trust --auth-host=reject --encoding=UTF8 --locale=en_US.UTF-8 > /tmp/initdb-receipt.log
fi
exec postgres -D /var/lib/postgresql/data -c listen_addresses= -c unix_socket_directories=/socket -c shared_preload_libraries=pg_net,pg_stat_statements -c cron.database_name=collection_library_acceptance -c cron.launch_active_jobs=off -c pg_net.database_name=family_restore_disabled -c wal_level=logical -c max_connections=30 -c shared_buffers=128MB -c timezone=UTC -c log_min_error_statement=panic -c log_statement=none
