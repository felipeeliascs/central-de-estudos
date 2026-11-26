import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { YouTube } from "../src/YouTube";
afterEach(() => {
  cleanup();
  delete window.YT;
});
it("explica a restrição de incorporação e libera o player ao sair", async () => {
  const destroy = vi.fn();
  let onError: ((e: { data: number }) => void) | undefined;
  window.YT = {
    Player: class {
      constructor(
        _mount: HTMLElement,
        options: { events: { onError: (e: { data: number }) => void } },
      ) {
        onError = options.events.onError;
      }
      destroy = destroy;
    },
  };
  const view = render(<YouTube id="abcdefghijk" />);
  await waitFor(() => expect(onError).toBeDefined());
  act(() => onError!({ data: 150 }));
  expect(screen.getByRole("status").textContent).toContain(
    "Abra a aula no YouTube",
  );
  view.unmount();
  expect(destroy).toHaveBeenCalledOnce();
});
