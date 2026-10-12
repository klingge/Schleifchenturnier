import type React from "react";
import { useLocation } from "react-router-dom";
import { DotsThreeVertical, SignOut } from "@phosphor-icons/react";
import sgaLogo from "@/assets/sga-logo.png";
import { Button as UiButton } from "@/components/ui/button";
import {
  DropdownMenu as UiDropdownMenu,
  DropdownMenuContent as UiDropdownMenuContent,
  DropdownMenuItem as UiDropdownMenuItem,
  DropdownMenuGroup as UiDropdownMenuGroup,
  DropdownMenuTrigger as UiDropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type LogoutHandler = () => void | Promise<void>;

export function LogoutMenuItem({ logout }: { logout: LogoutHandler }) {
  return (
    <UiDropdownMenuItem
      onSelect={() => {
        void logout();
      }}
    >
      <SignOut /> Abmelden
    </UiDropdownMenuItem>
  );
}

export function Shell({
  children,
  logout,
}: {
  children: React.ReactNode;
  logout?: LogoutHandler;
}) {
  const location = useLocation();
  const eventMenuOwnsLogout = /^\/admin\/events\/[^/]+(?:\/|$)/.test(
    location.pathname,
  );
  return (
    <>
      <a className="skip-link" href="#main-content">
        Zum Inhalt springen
      </a>
      <header>
        <a className="brand" href={logout ? "/admin" : "/"}>
          <img
            src={sgaLogo}
            alt="SG Arheilgen Tennis"
            width="512"
            height="512"
            fetchPriority="high"
          />
          <span>
            <strong>SGA Schleifchenturnier</strong>
            <small>SG Arheilgen Tennis</small>
          </span>
        </a>
        {logout && !eventMenuOwnsLogout && (
          <UiDropdownMenu>
            <UiDropdownMenuTrigger asChild>
              <UiButton
                className="shell-menu-trigger"
                variant="ghost"
                size="icon-lg"
                aria-label="Kontomenü öffnen"
              >
                <DotsThreeVertical />
              </UiButton>
            </UiDropdownMenuTrigger>
            <UiDropdownMenuContent align="end" className="min-w-44">
              <UiDropdownMenuGroup>
                <LogoutMenuItem logout={logout} />
              </UiDropdownMenuGroup>
            </UiDropdownMenuContent>
          </UiDropdownMenu>
        )}
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <i />
      <i />
      <i />
    </div>
  );
}
export function Empty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <b>{icon}</b>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
