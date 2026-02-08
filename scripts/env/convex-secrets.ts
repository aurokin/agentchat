import crypto from "node:crypto";

const main = (): void => {
    // Use the Node crypto API (not WebCrypto) so this works in Bun.
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
    });

    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" });
    const jwtPrivateKey = `${privateKeyPem}`.trimEnd().replace(/\n/g, " ");

    const publicJwk = publicKey.export({ format: "jwk" });
    const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicJwk }] });

    const encryptionKey = crypto.randomBytes(32).toString("base64");

    // Emit dotenv-compatible lines for easy copy/paste into .env.convex.<env>.local
    console.log("# Convex Auth + encryption secrets (keep private)");
    console.log(`JWKS=${jwks}`);
    console.log(`JWT_PRIVATE_KEY=${jwtPrivateKey}`);
    console.log(`ENCRYPTION_KEY=${encryptionKey}`);
};

try {
    main();
} catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
}
