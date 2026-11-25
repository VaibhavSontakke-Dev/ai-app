import type { ReactNode } from "react";
import type { Problem } from "@/lib/api";

export const label = (s: string): string => s.replaceAll("_", " ");
export const when = (iso: string): string => `${iso.slice(0, 16).replace("T", " ")} UTC`;

export function Failure({ problem }: { problem: Problem }) {
  return (
    <div role="alert" className="rounded-md border border-line p-4">
      <p className="font-medium text-danger">{problem.title}</p>
      {problem.detail && problem.detail !== problem.title && <p className="text-sm">{problem.detail}</p>}
      {problem.correlationId && <p className="mt-1 font-mono text-xs text-muted">Reference {problem.correlationId}</p>}
    </div>
  );
}

export function Warning({ children }: { children: ReactNode }) {
  return <div className="rounded-md bg-warn-bg px-4 py-3 text-sm text-warn">{children}</div>;
}

export function Loading() {
  return <p className="text-sm text-muted">Loading</p>;
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const th = "px-3 py-2 text-left text-xs font-medium text-muted";
export const td = "px-3 py-2 align-top text-sm";
