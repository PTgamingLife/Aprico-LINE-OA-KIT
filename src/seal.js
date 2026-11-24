/** GitHub wants each secret sealed with the repo's public key (libsodium sealed box). */
export async function seal(publicKey, values) {
  const { default: sodium } = await import('libsodium-wrappers');
  await sodium.ready;
  const key = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [
      k,
      sodium.to_base64(
        sodium.crypto_box_seal(sodium.from_string(v), key),
        sodium.base64_variants.ORIGINAL,
      ),
    ]),
  );
}
