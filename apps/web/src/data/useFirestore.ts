import { useEffect, useState } from 'react';
import { doc, onSnapshot, type Query } from 'firebase/firestore';
import type { ZodType } from '@site-streak/shared';
import { db } from '../lib/firebase';

// Live Firestore reads, served from the offline cache when there's no signal.
// Every document is checked against its shared schema; bad ones are logged and skipped.

type Live<T> = { data: T; loading: boolean };

function parse<T>(schema: ZodType<T>, path: string, value: unknown): T | null {
  const result = schema.safeParse(value);
  if (!result.success) console.warn(`Skipping malformed document ${path}`, result.error);
  return result.success ? result.data : null;
}

/** One document, or null while loading, missing or invalid. Pass a null path to skip. */
export function useDocData<T>(path: string | null, schema: ZodType<T>): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: true });

  useEffect(() => {
    if (!path) return;
    return onSnapshot(
      doc(db, path),
      (snap) => setState({ data: snap.exists() ? parse(schema, path, snap.data()) : null, loading: false }),
      (err) => {
        console.error(`Listening to ${path} failed`, err);
        setState({ data: null, loading: false });
      },
    );
  }, [path, schema]);

  return path ? state : { data: null, loading: false };
}

/** All documents matching a query, with their ids. `key` must change whenever the query does. */
export function useQueryData<T>(query: Query | null, key: string, schema: ZodType<T>): Live<(T & { id: string })[]> {
  const [state, setState] = useState<Live<(T & { id: string })[]>>({ data: [], loading: true });

  useEffect(() => {
    if (!query) return;
    return onSnapshot(
      query,
      (snap) =>
        setState({
          data: snap.docs.flatMap((d) => {
            const parsed = parse(schema, d.ref.path, d.data());
            return parsed ? [{ ...parsed, id: d.id }] : [];
          }),
          loading: false,
        }),
      (err) => {
        console.error(`Query ${key} failed`, err);
        setState({ data: [], loading: false });
      },
    );
    // The query object is rebuilt every render; `key` says when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, schema]);

  return query ? state : { data: [], loading: false };
}
