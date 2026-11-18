import type { APIRoute } from "astro";
import { app } from "../../../../server/src/app.js";
import { dispatchExpress } from "../../../../server/src/dispatch.js";

export const ALL: APIRoute = ({ request }) => dispatchExpress(app, request);
