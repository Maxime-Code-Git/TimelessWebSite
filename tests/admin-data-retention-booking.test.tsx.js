const fs = require('fs');
let content = fs.readFileSync('apps/web/tests/admin-data-retention-booking.test.tsx', 'utf8');

content = content.replace(
  `const mockFetcher = {
  data: {} as Record<string, unknown>,
  state: "idle",
  submit: vi.fn(),
  Form: ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>
};

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useFetcher: () => mockFetcher
  };
});`,
  `
import React, { useState, useEffect } from "react";

let setMockFetcherState: any = null;

const MockFetcherController = () => {
  const [fetcherState, setFetcherState] = useState({ state: "idle", data: {} });
  setMockFetcherState = setFetcherState;
  return null;
};

const useMockFetcher = () => {
  const [state, setState] = useState({ state: "idle", data: {} });
  
  useEffect(() => {
    setMockFetcherState = setState;
  }, []);

  return {
    ...state,
    submit: vi.fn(),
    Form: ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>
  };
};

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useFetcher: () => {
      // Return a global mutable object that React can track? No, useFetcher must trigger render.
      // We'll just export a mocked hook that reads from a global store.
      return actual.useFetcher(); 
    }
  };
});
`
);
