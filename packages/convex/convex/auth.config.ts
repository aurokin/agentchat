import { isAgentchatAuthDisabled } from "./lib/auth_mode";

export default {
    providers: isAgentchatAuthDisabled()
        ? []
        : [
              {
                  domain: process.env.CONVEX_SITE_URL,
                  applicationID: "convex",
              },
          ],
};
