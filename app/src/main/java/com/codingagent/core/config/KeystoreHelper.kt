package com.codingagent.core.config

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Thin wrapper around Android Keystore for storing API keys / tokens.
 *
 * Secrets never leave the Keystore in plaintext. We store an encrypted blob
 * in SharedPreferences (or a private file) whose decryption key is hardware-
 * backed when available.
 *
 * Usage:
 *   helper.storeSecret("cloud-api-key", rawKey)
 *   val key = helper.getSecret("cloud-api-key")
 */
class KeystoreHelper(private val context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply {
        load(null)
    }

    fun storeSecret(alias: String, plaintext: String) {
        val secretKey = getOrCreateSecretKey(alias)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey)
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))

        // Pack IV + ciphertext, base64, persist.
        val packed = ByteBuffer.allocate(4 + iv.size + ciphertext.size).apply {
            putInt(iv.size)
            put(iv)
            put(ciphertext)
        }.array()
        prefs.edit()
            .putString(prefKey(alias), Base64.encodeToString(packed, Base64.NO_WRAP))
            .apply()
    }

    fun getSecret(alias: String): String? {
        val encoded = prefs.getString(prefKey(alias), null) ?: return null
        val packed = Base64.decode(encoded, Base64.NO_WRAP)
        val buffer = ByteBuffer.wrap(packed)
        val ivSize = buffer.int
        val iv = ByteArray(ivSize)
        buffer.get(iv)
        val ciphertext = ByteArray(buffer.remaining())
        buffer.get(ciphertext)

        val secretKey = getOrCreateSecretKey(alias)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(128, iv))
        val plaintext = cipher.doFinal(ciphertext)
        return String(plaintext, Charsets.UTF_8)
    }

    fun deleteSecret(alias: String) {
        prefs.edit().remove(prefKey(alias)).apply()
        try {
            keyStore.deleteEntry(masterKeyAlias(alias))
        } catch (_: Exception) {
            // Entry may not exist.
        }
    }

    fun hasSecret(alias: String): Boolean =
        prefs.contains(prefKey(alias))

    private fun getOrCreateSecretKey(alias: String): SecretKey {
        val masterAlias = masterKeyAlias(alias)
        if (keyStore.containsAlias(masterAlias)) {
            return (keyStore.getEntry(masterAlias, null) as KeyStore.SecretKeyEntry).secretKey
        }
        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE
        )
        val spec = KeyGenParameterSpec.Builder(
            masterAlias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }

    private fun prefKey(alias: String) = "secret_$alias"
    private fun masterKeyAlias(alias: String) = "master_$alias"

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val PREFS_NAME = "coding_agent_secure_prefs"
    }
}
