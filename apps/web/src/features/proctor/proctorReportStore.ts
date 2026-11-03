import { useState, useEffect } from 'react';
import { ProctorSubjectHierarchyItem, submissionApi } from '../../services/apiClient';

interface ProctorCacheEntry {
  subjects: ProctorSubjectHierarchyItem[];
  lastFetchedAt: number;
}

export interface ProctorReportStoreState {
  currentProctorId: string | null;
  subjects: ProctorSubjectHierarchyItem[];
  isInitialLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastFetchedAt: number | null;
}

class ProctorReportStore {
  // Proctor-isolated cache Map: proctorId -> ProctorCacheEntry
  private cache = new Map<string, ProctorCacheEntry>();
  
  // Track in-flight promises per proctorId to avoid duplicate API requests (e.g. strict mode double-mount)
  private inFlightRequests = new Map<string, Promise<ProctorSubjectHierarchyItem[]>>();

  // Change listeners
  private listeners = new Set<() => void>();

  // Active store state
  private state: ProctorReportStoreState = {
    currentProctorId: null,
    subjects: [],
    isInitialLoading: false,
    isRefreshing: false,
    error: null,
    lastFetchedAt: null
  };

  // Re-validation stale threshold: 60 seconds
  private STALE_TIME_MS = 60 * 1000;

  getState(): ProctorReportStoreState {
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

  /**
   * Initializes or refreshes data for the given proctorId.
   * If force=true, forces a network fetch regardless of staleness.
   */
  async loadReport(proctorId: string, options?: { force?: boolean }): Promise<void> {
    if (!proctorId) return;

    const cached = this.cache.get(proctorId);
    const now = Date.now();
    const hasCachedData = Boolean(cached && Array.isArray(cached.subjects));
    const isStale = !cached || (now - cached.lastFetchedAt > this.STALE_TIME_MS);

    // If active proctor changed, synchronize state immediately with that proctor's cache
    if (this.state.currentProctorId !== proctorId) {
      this.state = {
        currentProctorId: proctorId,
        subjects: cached?.subjects || [],
        isInitialLoading: !hasCachedData,
        isRefreshing: false,
        error: null,
        lastFetchedAt: cached?.lastFetchedAt || null
      };
      this.notify();
    }

    // If cached data is available, not forcing refresh, and not stale, reuse cache immediately
    if (hasCachedData && !options?.force && !isStale) {
      return;
    }

    // If an in-flight fetch is already running for this proctor, reuse that promise
    const existingPromise = this.inFlightRequests.get(proctorId);
    if (existingPromise) {
      try {
        await existingPromise;
      } catch {
        // Handled in the originator
      }
      return;
    }

    // Update state to loading or refreshing
    if (!hasCachedData) {
      this.state = {
        ...this.state,
        currentProctorId: proctorId,
        isInitialLoading: true,
        isRefreshing: false,
        error: null
      };
    } else {
      this.state = {
        ...this.state,
        currentProctorId: proctorId,
        isRefreshing: true,
        error: null
      };
    }
    this.notify();

    // Start background network fetch
    const fetchPromise = (async () => {
      const res = await submissionApi.getMenteeSubmissionsReport();
      const freshSubjects = res.subjects || [];
      const fetchTime = Date.now();

      // Store in proctor-isolated cache
      this.cache.set(proctorId, {
        subjects: freshSubjects,
        lastFetchedAt: fetchTime
      });

      // Update state if we are still scoped to this proctor
      if (this.state.currentProctorId === proctorId) {
        this.state = {
          currentProctorId: proctorId,
          subjects: freshSubjects,
          isInitialLoading: false,
          isRefreshing: false,
          error: null,
          lastFetchedAt: fetchTime
        };
        this.notify();
      }

      return freshSubjects;
    })();

    this.inFlightRequests.set(proctorId, fetchPromise);

    try {
      await fetchPromise;
    } catch (err: any) {
      console.error('[ProctorReportStore] Failed to fetch mentee report:', err);
      if (this.state.currentProctorId === proctorId) {
        this.state = {
          ...this.state,
          isInitialLoading: false,
          isRefreshing: false,
          error: err.message || 'Failed to update mentee submissions report'
        };
        this.notify();
      }
    } finally {
      this.inFlightRequests.delete(proctorId);
    }
  }

  /**
   * Clears cached data for a specific proctor or all proctors (on logout / session clear).
   */
  clear(proctorId?: string) {
    if (proctorId) {
      this.cache.delete(proctorId);
      this.inFlightRequests.delete(proctorId);
      if (this.state.currentProctorId === proctorId) {
        this.state = {
          currentProctorId: null,
          subjects: [],
          isInitialLoading: false,
          isRefreshing: false,
          error: null,
          lastFetchedAt: null
        };
        this.notify();
      }
    } else {
      this.cache.clear();
      this.inFlightRequests.clear();
      this.state = {
        currentProctorId: null,
        subjects: [],
        isInitialLoading: false,
        isRefreshing: false,
        error: null,
        lastFetchedAt: null
      };
      this.notify();
    }
  }

  /**
   * Invalidate a proctor's cache so the next access refetches fresh data.
   */
  invalidate(proctorId?: string) {
    if (proctorId) {
      const entry = this.cache.get(proctorId);
      if (entry) {
        entry.lastFetchedAt = 0;
      }
    } else {
      for (const entry of this.cache.values()) {
        entry.lastFetchedAt = 0;
      }
    }
  }
}

export const proctorReportStore = new ProctorReportStore();

/**
 * Custom React hook for consuming cached Proctor Report data.
 */
export function useProctorReport(proctorId: string | null) {
  const [state, setState] = useState<ProctorReportStoreState>(() => proctorReportStore.getState());

  useEffect(() => {
    const unsubscribe = proctorReportStore.subscribe(() => {
      setState(proctorReportStore.getState());
    });

    if (proctorId) {
      proctorReportStore.loadReport(proctorId);
    }

    return () => {
      unsubscribe();
    };
  }, [proctorId]);

  const refresh = async () => {
    if (proctorId) {
      await proctorReportStore.loadReport(proctorId, { force: true });
    }
  };

  const isCurrent = state.currentProctorId === proctorId;

  return {
    subjects: isCurrent ? state.subjects : [],
    isInitialLoading: isCurrent ? state.isInitialLoading : true,
    isRefreshing: state.isRefreshing,
    error: state.error,
    lastFetchedAt: state.lastFetchedAt,
    refresh
  };
}

