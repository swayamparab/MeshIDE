import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
    const value =
        process.env.GITHUB_TOKEN_ENCRYPTION_KEY;

    if (!value) {
        throw new Error(
            "GITHUB_TOKEN_ENCRYPTION_KEY is not configured.",
        );
    }

    const key = Buffer.from(value, "hex");

    if (key.length !== KEY_LENGTH) {
        throw new Error(
            "GITHUB_TOKEN_ENCRYPTION_KEY must be exactly 32 bytes encoded as hex.",
        );
    }

    return key;
}

export function encryptSecret(
    plaintext: string,
): string {
    const key = getEncryptionKey();

    const iv =
        crypto.randomBytes(IV_LENGTH);

    const cipher =
        crypto.createCipheriv(
            ALGORITHM,
            key,
            iv,
        );

    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);

    const authTag =
        cipher.getAuthTag();

    return [
        iv.toString("hex"),
        authTag.toString("hex"),
        encrypted.toString("hex"),
    ].join(":");
}

export function decryptSecret(
    encryptedValue: string,
): string {
    const key = getEncryptionKey();

    const parts =
        encryptedValue.split(":");

    if (parts.length !== 3) {
        throw new Error(
            "Invalid encrypted secret format.",
        );
    }

    const ivHex = parts[0];
    const authTagHex = parts[1];
    const ciphertextHex = parts[2];

    if (
        !ivHex ||
        !authTagHex ||
        !ciphertextHex
    ) {
        throw new Error(
            "Invalid encrypted secret format.",
        );
    }

    const iv =
        Buffer.from(
            ivHex,
            "hex",
        );

    const authTag =
        Buffer.from(
            authTagHex,
            "hex",
        );

    const ciphertext =
        Buffer.from(
            ciphertextHex,
            "hex",
        );

    if (
        iv.length !== IV_LENGTH ||
        authTag.length !== AUTH_TAG_LENGTH
    ) {
        throw new Error(
            "Invalid encrypted secret.",
        );
    }

    const decipher =
        crypto.createDecipheriv(
            ALGORITHM,
            key,
            iv,
        );

    decipher.setAuthTag(
        authTag,
    );

    const decrypted =
        Buffer.concat([
            decipher.update(
                ciphertext,
            ),
            decipher.final(),
        ]);

    return decrypted.toString(
        "utf8",
    );
}