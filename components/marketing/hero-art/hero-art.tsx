import React from "react";
import { BugSpecimen } from "./bug-specimen";
import { AuditSeal } from "./audit-seal";

/**
 * The hero's two full-bleed edge drawings, positioned per the
 * unpatched-hero-art skill's exact crop rule: the bug's centre line sits on
 * the left viewport edge (`translate(-50%, -50%)` from `left: 0`), the
 * seal's centre sits on the right viewport edge (`translate(50%, -50%)`
 * from `right: 0`) -- each shows exactly half its drawing. Positioning and
 * animation timing live in app/globals.css's `.hero-art*` rules (ported
 * from the reference's own <style> block); this wrapper only places the two
 * SVGs and marks itself `overflow-hidden` so neither half can ever cause a
 * horizontal scrollbar, per the skill's explicit requirement.
 *
 * Decorative only: both SVGs already carry `aria-hidden`/`focusable="false"`
 * and `pointer-events: none` (from `.hero-art`), so this wrapper needs no
 * extra a11y handling of its own.
 */
export function HeroArt() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <BugSpecimen />
      <AuditSeal />
    </div>
  );
}
