import { useState, useEffect, useCallback } from 'react';

/**
 * Lightweight browser History API hook for AcadAssess routing.
 * Synchronizes browser navigation events and provides a reactive pushState navigator.
 */
export function useRouter() {
  const [pathname, setPathname] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname || '/';
    }
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname || '/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((to: string) => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname !== to) {
        window.history.pushState(null, '', to);
        setPathname(to);
        // Scroll to top on navigation
        window.scrollTo(0, 0);
      }
    }
  }, []);

  return { pathname, navigate };
}
