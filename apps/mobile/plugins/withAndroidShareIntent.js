const {
    createRunOncePlugin,
    withAndroidManifest,
    withMainActivity,
} = require("@expo/config-plugins");

const ACTION_SEND = "android.intent.action.SEND";

function getMainActivity(manifest) {
    const application = manifest.manifest.application?.[0];
    if (!application) return null;
    const activities = application.activity ?? [];
    return (
        activities.find((activity) => {
            const name = activity.$?.["android:name"];
            return name === ".MainActivity" || name?.endsWith(".MainActivity");
        }) ?? null
    );
}

function hasIntentFilter(activity, actionName) {
    const filters = activity["intent-filter"] ?? [];
    return filters.some((filter) =>
        (filter.action ?? []).some(
            (action) => action.$?.["android:name"] === actionName,
        ),
    );
}

function makeSendIntentFilter(actionName, mimeTypes) {
    return {
        action: [{ $: { "android:name": actionName } }],
        category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
        data: mimeTypes.map((mimeType) => ({
            $: { "android:mimeType": mimeType },
        })),
    };
}

function withShareIntentManifest(config) {
    return withAndroidManifest(config, (configWithManifest) => {
        const mainActivity = getMainActivity(configWithManifest.modResults);
        if (!mainActivity) {
            throw new Error(
                "withAndroidShareIntent: MainActivity not found in AndroidManifest.xml",
            );
        }

        if (!hasIntentFilter(mainActivity, ACTION_SEND)) {
            mainActivity["intent-filter"] = [
                ...(mainActivity["intent-filter"] ?? []),
                makeSendIntentFilter(ACTION_SEND, ["text/*"]),
            ];
        }

        return configWithManifest;
    });
}

function ensureImport(contents, importLine) {
    if (contents.includes(importLine)) return contents;
    const packageMatch = contents.match(/^package\s+.+$/m);
    const packageLine = packageMatch?.[0];
    if (!packageLine) {
        throw new Error(
            "withAndroidShareIntent: Could not locate Kotlin package declaration",
        );
    }
    return contents.replace(packageLine, `${packageLine}\n\n${importLine}`);
}

function withShareIntentMainActivity(config) {
    const schemeValue = Array.isArray(config.scheme)
        ? config.scheme[0]
        : config.scheme;
    const scheme = typeof schemeValue === "string" ? schemeValue : "agentchat";

    return withMainActivity(config, (configWithMainActivity) => {
        if (configWithMainActivity.modResults.language !== "kt") {
            return configWithMainActivity;
        }

        let contents = configWithMainActivity.modResults.contents;
        if (!contents.includes("mapShareIntentToDeepLink")) {
            contents = ensureImport(contents, "import android.content.Intent");
            contents = ensureImport(contents, "import android.net.Uri");

            if (!contents.includes("setIntent(mapShareIntentToDeepLink(intent))")) {
                contents = contents.replace(
                    "    super.onCreate(null)",
                    [
                        "    setIntent(mapShareIntentToDeepLink(intent))",
                        "    super.onCreate(null)",
                    ].join("\n"),
                );
            }

            const shareMethods = `

  override fun onNewIntent(intent: Intent) {
    val mappedIntent = mapShareIntentToDeepLink(intent)
    super.onNewIntent(mappedIntent)
    setIntent(mappedIntent)
  }

  private fun mapShareIntentToDeepLink(intent: Intent): Intent {
    val action = intent.action
    if (action != Intent.ACTION_SEND) {
      return intent
    }

    val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
    if (sharedText.isEmpty()) {
      return intent
    }

    val deepLink = Uri.Builder()
      .scheme("${scheme}")
      .path("/")
      .appendQueryParameter("sharedAt", System.currentTimeMillis().toString())
      .appendQueryParameter("sharedText", sharedText)
      .build()

    return Intent(Intent.ACTION_VIEW, deepLink).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
  }
`;

            contents = contents.replace(
                "  /**\n   * Returns the name of the main component registered from JavaScript. This is used to schedule\n   * rendering of the component.\n   */",
                `${shareMethods}\n  /**\n   * Returns the name of the main component registered from JavaScript. This is used to schedule\n   * rendering of the component.\n   */`,
            );
        }

        configWithMainActivity.modResults.contents = contents;
        return configWithMainActivity;
    });
}

function withAndroidShareIntent(config) {
    config = withShareIntentManifest(config);
    config = withShareIntentMainActivity(config);
    return config;
}

module.exports = createRunOncePlugin(
    withAndroidShareIntent,
    "with-android-share-intent",
    "1.0.0",
);
