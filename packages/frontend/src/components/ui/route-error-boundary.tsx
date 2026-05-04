import i18n from "@i18n/config";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("RouteErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-lg font-semibold text-foreground">
            {i18n.t("errors.routeLoadTitle", {
              defaultValue: "Could not load this screen",
            })}
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {i18n.t("errors.routeLoadBody", {
              defaultValue:
                "The page failed to load. This sometimes happens after an update. Reload the app or return home.",
            })}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => window.location.reload()}>
              {i18n.t("errors.reloadPage", {
                defaultValue: "Reload page",
              })}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.assign("/");
              }}
            >
              {i18n.t("errors.goHome", {
                defaultValue: "Go home",
              })}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
