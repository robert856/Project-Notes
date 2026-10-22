import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
interface Drag {
  id: string;
  pointer: number;
  handle: HTMLElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
}
/** Pointer capture keeps task reordering independent of the browser's native file/link drag UI. */
export function useTaskPointerDrag(
  items: { id: string }[],
  disabled: boolean,
  onInsert: (id: string, slot: number) => void,
) {
  const listRef = useRef<HTMLDivElement>(null),
    session = useRef<Drag | null>(null),
    frame = useRef<number>(0),
    slot = useRef<number | undefined>(undefined);
  const [over, setOver] = useState<number>(),
    [dragging, setDragging] = useState<string>();
  const options = useRef({ items, disabled, onInsert });
  options.current = { items, disabled, onInsert };
  const mark = (value: number | undefined) => {
    slot.current = value;
    setOver(value);
  };
  const finish = () => {
    const drag = session.current;
    if (!drag) return;
    session.current = null;
    cancelAnimationFrame(frame.current);
    if (drag.handle.hasPointerCapture(drag.pointer))
      drag.handle.releasePointerCapture(drag.pointer);
    document.documentElement.classList.remove("task-pointer-drag");
    mark(undefined);
    setDragging(undefined);
  };
  const update = () => {
    const drag = session.current,
      list = listRef.current;
    if (!drag?.active || !list) return;
    const box = list.getBoundingClientRect(),
      scroller = list.closest<HTMLElement>(".page-preview,.page-own-content"),
      clip = scroller?.getBoundingClientRect();
    if (
      drag.x < box.left - 8 ||
      drag.x > box.right + 8 ||
      drag.y < Math.max(box.top, clip?.top ?? box.top) - 8 ||
      drag.y > Math.min(box.bottom, clip?.bottom ?? box.bottom) + 8
    ) {
      mark(undefined);
      return;
    }
    const rows = [...list.querySelectorAll<HTMLElement>("[data-task-id]")];
    let index = rows.findIndex((row) => {
      const rect = row.getBoundingClientRect();
      return drag.y < rect.top + rect.height / 2;
    });
    if (index < 0) index = rows.length;
    const from = options.current.items.findIndex((item) => item.id === drag.id);
    mark(index === from || index === from + 1 ? undefined : index);
  };
  const scroll = () => {
    const drag = session.current,
      list = listRef.current;
    if (!drag?.active || !list) return;
    const scroller = list.closest<HTMLElement>(
      ".page-preview,.page-own-content",
    );
    if (scroller) {
      const box = scroller.getBoundingClientRect();
      if (
        drag.x >= box.left &&
        drag.x <= box.right &&
        drag.y >= box.top &&
        drag.y <= box.bottom
      ) {
        const old = scroller.scrollTop;
        if (drag.y < box.top + 20) scroller.scrollTop -= 7;
        else if (drag.y > box.bottom - 20) scroller.scrollTop += 7;
        if (old !== scroller.scrollTop) update();
      }
    }
    frame.current = requestAnimationFrame(scroll);
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && session.current) {
        event.preventDefault();
        event.stopPropagation();
        finish();
      }
    };
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", finish);
      finish();
    };
  }, []);
  return {
    listRef,
    over,
    dragging,
    handleProps: (id: string) => ({
      draggable: false,
      onDragStart: (event: React.DragEvent) => event.preventDefault(),
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0 || options.current.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        session.current = {
          id,
          pointer: event.pointerId,
          handle: event.currentTarget,
          startX: event.clientX,
          startY: event.clientY,
          x: event.clientX,
          y: event.clientY,
          active: false,
        };
      },
      onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = session.current;
        if (!drag || drag.pointer !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        drag.x = event.clientX;
        drag.y = event.clientY;
        if (
          !drag.active &&
          Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 4
        ) {
          drag.active = true;
          setDragging(drag.id);
          document.documentElement.classList.add("task-pointer-drag");
          frame.current = requestAnimationFrame(scroll);
        }
        update();
      },
      onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = session.current;
        if (!drag || drag.pointer !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        drag.x = event.clientX;
        drag.y = event.clientY;
        update();
        const destination = slot.current;
        finish();
        if (
          drag.active &&
          destination !== undefined &&
          !options.current.disabled
        )
          options.current.onInsert(drag.id, destination);
      },
      onPointerCancel: finish,
      onLostPointerCapture: finish,
    }),
  };
}
