import { cn } from "../../lib/cn";

/**
 * Enter/exit for trigger-anchored panels (dropdowns, the notification preview). The panel
 * stays mounted so it can animate out: closed is invisible (out of the tab order and the
 * accessibility tree), slightly scaled toward its trigger. Grows from the trigger's corner,
 * never from scale(0); 150ms in, 100ms out (the system responding should be quick). A CSS
 * transition, so rapid open/close retargets instead of restarting. Reduced motion keeps the
 * fade and drops the scale.
 */
export function popoverMotion(open: boolean, origin: "top-left" | "top-right") {
  return cn(
    "transition-[opacity,transform,visibility] ease-out motion-reduce:scale-100",
    origin === "top-left" ? "origin-top-left" : "origin-top-right",
    open ? "visible scale-100 opacity-100 duration-150" : "pointer-events-none invisible scale-[0.97] opacity-0 duration-100",
  );
}
