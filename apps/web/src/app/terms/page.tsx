import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Terms of Service | Agentchat",
};

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-background px-6 py-12">
            <div className="mx-auto w-full max-w-3xl">
                <div className="mb-10 flex items-start justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight">
                            Terms of Service
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Last updated: February 8, 2026
                        </p>
                    </div>
                    <Link
                        href="/"
                        className="text-sm text-muted-foreground hover:text-foreground"
                    >
                        Agentchat
                    </Link>
                </div>

                <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground prose-a:text-primary prose-strong:text-foreground">
                    <p>
                        These Terms of Service (the &quot;Terms&quot;) govern
                        your access to and use of Agentchat (the
                        &quot;Service&quot;). By using the Service, you agree to
                        these Terms.
                    </p>

                    <h2>Eligibility</h2>
                    <p>
                        You must be at least 13 years old (or the minimum age
                        required in your country) to use the Service.
                    </p>

                    <h2>Accounts</h2>
                    <p>
                        You are responsible for your account and for any
                        activity that occurs under your account. Do not share
                        your credentials.
                    </p>

                    <h2>Subscriptions and Billing</h2>
                    <p>
                        Certain features may require a paid subscription. Web
                        purchases may be processed through RevenueCat and Stripe
                        as our billing providers. Taxes may apply where
                        required.
                    </p>

                    <h2>Acceptable Use</h2>
                    <p>
                        You agree not to misuse the Service. For example, you
                        will not attempt to disrupt the Service, access other
                        users&apos; data, or use the Service for unlawful
                        activities.
                    </p>

                    <h2>Content and AI Output</h2>
                    <p>
                        The Service may generate content using AI models. AI
                        output may be inaccurate or incomplete. You are
                        responsible for how you use any output, and you should
                        verify important information.
                    </p>

                    <h2>Disclaimer</h2>
                    <p>
                        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
                        AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS
                        OR IMPLIED.
                    </p>

                    <h2>Limitation of Liability</h2>
                    <p>
                        TO THE MAXIMUM EXTENT PERMITTED BY LAW, ROUTERCHAT WILL
                        NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
                        CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
                        PROFITS OR REVENUES.
                    </p>

                    <h2>Termination</h2>
                    <p>
                        We may suspend or terminate access to the Service at any
                        time if we reasonably believe you have violated these
                        Terms or if required to protect the Service or other
                        users.
                    </p>

                    <h2>Changes to These Terms</h2>
                    <p>
                        We may update these Terms from time to time. Continued
                        use of the Service after changes become effective
                        constitutes acceptance of the updated Terms.
                    </p>

                    <h2>Contact</h2>
                    <p>
                        Questions about these Terms:{" "}
                        <a href="mailto:support@routerchat.chat">
                            support@routerchat.chat
                        </a>
                        .
                    </p>
                </div>
            </div>
        </main>
    );
}
