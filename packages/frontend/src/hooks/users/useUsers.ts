import { useState, useEffect } from "react";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  deleteUsers,
  User,
} from "@services/api";

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      setError(null);
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  async function addUser(user: Partial<User>) {
    try {
      const newUser = await createUser(user);
      setUsers([...users, newUser]);
      return newUser;
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
      throw err;
    }
  }

  async function modifyUser(id: string, updates: Partial<User>) {
    try {
      const updated = await updateUser(id, updates);
      setUsers(users.map((u) => (u.id === id ? updated : u)));
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
      throw err;
    }
  }

  async function removeUser(id: string) {
    try {
      await deleteUser(id);
      setUsers(users.filter((u) => u.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
      throw err;
    }
  }

  async function removeUsers(ids: string[]) {
    try {
      await deleteUsers(ids);
      setUsers(users.filter((u) => !ids.includes(u.id)));
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
      throw err;
    }
  }

  return {
    users,
    loading,
    error,
    loadUsers,
    addUser,
    modifyUser,
    removeUser,
    removeUsers,
  };
}
