/**
 * Unit tests for providers/QueryProvider.tsx — React Query client provider.
 *
 * Verifies that QueryProvider correctly wraps children with the React Query
 * context and that child components can access React Query hooks.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { QueryProvider } from "./QueryProvider";

/**
 * A small helper component that calls useQuery to verify the provider
 * is correctly supplying the QueryClient context.
 */
function QueryConsumer() {
  const { status } = useQuery({
    queryKey: ["test-provider"],
    queryFn: () => Promise.resolve("hello"),
    enabled: false, // do not actually fetch — just proves hook works
  });
  return <span data-testid="status">{status}</span>;
}

describe("QueryProvider", () => {
  it("renders children", () => {
    render(
      <QueryProvider>
        <div data-testid="child">Hello</div>
      </QueryProvider>,
    );
    expect(screen.getByTestId("child").textContent).toBe("Hello");
  });

  it("provides QueryClient context so useQuery works", () => {
    render(
      <QueryProvider>
        <QueryConsumer />
      </QueryProvider>,
    );
    // With enabled: false, useQuery starts in 'pending' status
    const el = screen.getByTestId("status");
    expect(el.textContent).toBe("pending");
  });
});
