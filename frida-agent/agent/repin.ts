/* 
   Android SSL Re-pinning frida script v0.2 030417-pier 

   $ adb push burpca-cert-der.crt /data/local/tmp/cert-der.crt
   $ frida -U -f it.app.mobile -l frida-android-repinning.js --no-pause

   https://techblog.mediaservice.net/2017/07/universal-android-ssl-pinning-bypass-with-frida/
   
   UPDATE 20191605: Fixed undeclared var. Thanks to @oleavr and @ehsanpc9999 !
*/

import * as logger from './logger.js';

export function repinCertificate() {

    logger.debug("Cert Pinning Bypass/Re-Pinning");

    var CertificateFactory = Java.use("java.security.cert.CertificateFactory");
    var FileInputStream = Java.use("java.io.FileInputStream");
    var BufferedInputStream = Java.use("java.io.BufferedInputStream");
    var X509Certificate = Java.use("java.security.cert.X509Certificate");
    var KeyStore = Java.use("java.security.KeyStore");
    var TrustManagerFactory = Java.use("javax.net.ssl.TrustManagerFactory");
    var SSLContext = Java.use("javax.net.ssl.SSLContext");

    // Load CAs from an InputStream
    logger.debug("Loading our CA...")
    var cf = CertificateFactory.getInstance("X.509");
    
    try {
        var fileInputStream = FileInputStream.$new("/data/local/tmp/stratus-ca.crt");
    }
    catch(err) {
        logger.debug(`error while reading cert file: ${err}`);
    }
    
    var bufferedInputStream = BufferedInputStream.$new(fileInputStream);
    var ca = cf.generateCertificate(bufferedInputStream);
    bufferedInputStream.close();

    var certInfo = Java.cast(ca, X509Certificate);
    logger.debug("Our CA Info: " + certInfo.getSubjectDN());

    // Create a KeyStore containing our trusted CAs
    logger.debug("Creating a KeyStore for our CA...");
    var keyStoreType = KeyStore.getDefaultType();
    var keyStore = KeyStore.getInstance(keyStoreType);
    keyStore.load(null, null);
    keyStore.setCertificateEntry("ca", ca);
    
    // Create a TrustManager that trusts the CAs in our KeyStore
    logger.debug("Creating a TrustManager that trusts the CA in our KeyStore...");
    var tmfAlgorithm = TrustManagerFactory.getDefaultAlgorithm();
    var tmf = TrustManagerFactory.getInstance(tmfAlgorithm);
    tmf.init(keyStore);
    logger.debug("Our TrustManager is ready...");

    logger.debug("Hijacking SSLContext methods now...")
    logger.debug("Waiting for the app to invoke SSLContext.init()...")

    SSLContext.init.overload("[Ljavax.net.ssl.KeyManager;", "[Ljavax.net.ssl.TrustManager;", "java.security.SecureRandom").implementation = function(a: any, b: any, c: any) {
        logger.debug("App invoked javax.net.ssl.SSLContext.init...");
        SSLContext.init.overload("[Ljavax.net.ssl.KeyManager;", "[Ljavax.net.ssl.TrustManager;", "java.security.SecureRandom").call(this, a, tmf.getTrustManagers(), c);
        logger.debug("SSLContext initialized with our custom TrustManager!");
    }
}