import { createContext, useContext } from 'react'
import { nestTodoListOps, type TodoListOps } from './todoListOps'

export type TodoListOpsContextValue = {
  ops: TodoListOps
  canMutate?: boolean
}

export const TodoListOpsContext = createContext<TodoListOpsContextValue>({
  ops: nestTodoListOps,
})

export function useTodoListOpsContext(): TodoListOpsContextValue {
  return useContext(TodoListOpsContext)
}
