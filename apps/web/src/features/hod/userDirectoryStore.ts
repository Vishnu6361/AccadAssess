import { useState, useEffect } from 'react';
import { Programme, Specialization } from '@smartfa/contracts';
import { hodApi } from '../../services/apiClient';

export interface UserDirectoryState {
  users: any[];
  allocations: any[];
  classSubjects: any[];
  classes: any[];
  subjects: any[];
  programmes: Programme[];
  specializations: Specialization[];
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  activeTab: 'faculties' | 'students';
  search: string;
}

const initialDirectoryState: UserDirectoryState = {
  users: [],
  allocations: [],
  classSubjects: [],
  classes: [],
  subjects: [],
  programmes: [],
  specializations: [],
  isLoaded: false,
  isLoading: false,
  error: null,
  lastFetchedAt: null,
  activeTab: 'faculties',
  search: ''
};

class UserDirectoryStore {
  private state: UserDirectoryState = { ...initialDirectoryState };
  private listeners: Set<() => void> = new Set();
  private inFlightFetch: Promise<UserDirectoryState> | null = null;

  getState(): UserDirectoryState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  setActiveTab(tab: 'faculties' | 'students') {
    this.state = {
      ...this.state,
      activeTab: tab
    };
    this.notify();
  }

  setSearch(search: string) {
    this.state = {
      ...this.state,
      search
    };
    this.notify();
  }

  async fetchDirectory(force = false): Promise<UserDirectoryState> {
    // If data is already cached and not explicitly forced, reuse existing records
    if (this.state.isLoaded && !force) {
      return this.state;
    }

    // In-flight request deduplication: return existing pending promise
    if (this.inFlightFetch) {
      return this.inFlightFetch;
    }

    this.state = {
      ...this.state,
      isLoading: true,
      error: null
    };
    this.notify();

    this.inFlightFetch = (async () => {
      try {
        const [usersData, csData, clsData, subData, progsData, specsData, allocsData] = await Promise.all([
          hodApi.getUsers().catch(() => []),
          hodApi.getClassSubjects().catch(() => []),
          hodApi.getClasses().catch(() => []),
          hodApi.getSubjects().catch(() => []),
          hodApi.getProgrammes().catch(() => []),
          hodApi.getSpecializations().catch(() => []),
          hodApi.getFacultyAllocations().catch(() => [])
        ]);

        this.state = {
          ...this.state,
          users: usersData || [],
          allocations: allocsData || [],
          classSubjects: csData || [],
          classes: clsData || [],
          subjects: subData || [],
          programmes: progsData || [],
          specializations: specsData || [],
          isLoaded: true,
          isLoading: false,
          error: null,
          lastFetchedAt: Date.now()
        };
        this.notify();
        return this.state;
      } catch (err: any) {
        // Failed requests are NOT cached as successful results
        this.state = {
          ...this.state,
          isLoading: false,
          error: err.message || 'Failed to load user directory'
        };
        this.notify();
        throw err;
      } finally {
        this.inFlightFetch = null;
      }
    })();

    return this.inFlightFetch;
  }

  updateUserStatus(userId: string, nextStatus: 'active' | 'inactive') {
    this.state = {
      ...this.state,
      users: this.state.users.map(u => 
        u.id === userId ? { ...u, status: nextStatus } : u
      )
    };
    this.notify();
  }

  updateUserProfile(updatedUser: any) {
    this.state = {
      ...this.state,
      users: this.state.users.map(u => 
        u.id === updatedUser.id ? { ...u, ...updatedUser } : u
      )
    };
    this.notify();
  }

  addUser(newUser: any) {
    const exists = this.state.users.some(u => u.id === newUser.id || u.email === newUser.email);
    const updatedUsers = exists
      ? this.state.users.map(u => (u.id === newUser.id || u.email === newUser.email ? { ...u, ...newUser } : u))
      : [newUser, ...this.state.users];

    this.state = {
      ...this.state,
      users: updatedUsers
    };
    this.notify();
  }

  removeUser(userId: string) {
    this.state = {
      ...this.state,
      users: this.state.users.filter(u => u.id !== userId)
    };
    this.notify();
  }

  updateClassSubjects(classSubjects: any[]) {
    this.state = {
      ...this.state,
      classSubjects
    };
    this.notify();
  }

  invalidate() {
    this.state = {
      ...this.state,
      isLoaded: false
    };
    this.notify();
  }

  clear() {
    this.state = { ...initialDirectoryState };
    this.inFlightFetch = null;
    this.notify();
  }
}

export const userDirectoryStore = new UserDirectoryStore();

export function useUserDirectory() {
  const [state, setState] = useState<UserDirectoryState>(() => userDirectoryStore.getState());

  useEffect(() => {
    const unsubscribe = userDirectoryStore.subscribe(() => {
      setState({ ...userDirectoryStore.getState() });
    });
    return unsubscribe;
  }, []);

  return {
    ...state,
    fetchDirectory: (force?: boolean) => userDirectoryStore.fetchDirectory(force),
    setActiveTab: (tab: 'faculties' | 'students') => userDirectoryStore.setActiveTab(tab),
    setSearch: (search: string) => userDirectoryStore.setSearch(search),
    updateUserStatus: (userId: string, nextStatus: 'active' | 'inactive') => userDirectoryStore.updateUserStatus(userId, nextStatus),
    updateUserProfile: (user: any) => userDirectoryStore.updateUserProfile(user),
    addUser: (user: any) => userDirectoryStore.addUser(user),
    removeUser: (userId: string) => userDirectoryStore.removeUser(userId),
    updateClassSubjects: (cs: any[]) => userDirectoryStore.updateClassSubjects(cs),
    invalidate: () => userDirectoryStore.invalidate(),
    clear: () => userDirectoryStore.clear()
  };
}
