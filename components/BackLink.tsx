"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import { hasInAppHistory } from "@/lib/backNavigation";

type BackLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  /** Where Back goes when there is no earlier screen inside the app (opened directly, from a push, after a reload). */
  fallbackHref: string;
};

/**
 * A back control for the video screens: returns to the in-app screen the person
 * came from, or to `fallbackHref` when there is none. It is still a real link to
 * the fallback (so open-in-new-tab and the like behave), the click just goes back
 * instead when there is somewhere in the app to go back to.
 */
export default function BackLink({ fallbackHref, onClick, children, ...rest }: BackLinkProps) {
  const router = useRouter();
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // open in a new tab etc.: leave to the browser
    if (hasInAppHistory()) {
      e.preventDefault();
      router.back();
    }
  };
  return (
    <Link {...rest} href={fallbackHref} onClick={handleClick}>
      {children}
    </Link>
  );
}
