// Host wiring + thin re-export. The single contract definition (generated OpenAPI types + typed
// client) lives in packages/shared (@walsh/shared); here we bind that client to this app's session
// store and API base URL, then re-export the whole surface unchanged.
//
// NEXT_PUBLIC_API_URL must be read as a *literal* `process.env.NEXT_PUBLIC_API_URL` here (in the
// Next-compiled app), not inside @walsh/shared: Next only inlines the value into its own compiled
// code, so the external package cannot resolve it in the browser. configureClient carries it into
// the shared client.
import { configureClient } from "@walsh/shared";
import { getToken } from "./session";

configureClient({ getToken, apiUrl: process.env.NEXT_PUBLIC_API_URL });

export * from "@walsh/shared";
