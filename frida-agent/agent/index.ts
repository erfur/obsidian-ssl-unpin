function unpin() {
    // TrustManagerImpl (Android > 7) //
    ////////////////////////////////////
    try {
        // Bypass TrustManagerImpl (Android > 7) {1}
        var array_list = Java.use("java.util.ArrayList");
        var TrustManagerImpl_Activity_1 = Java.use('com.android.org.conscrypt.TrustManagerImpl');
        TrustManagerImpl_Activity_1.checkTrustedRecursive.implementation = function(certs: any, ocspData: any, tlsSctData: any, host: any, clientAuth: any, untrustedChain: any, trustAnchorChain: any, used: any) {
            console.log('[+] Bypassing TrustManagerImpl (Android > 7) checkTrustedRecursive check for: '+ host);
            return array_list.$new();
        };
    } catch (err) {
        console.log('[-] TrustManagerImpl (Android > 7) checkTrustedRecursive check not found');
    }
}

rpc.exports = {
    init(stage, parameters) {
        Java.perform(() => {
            unpin();
        });
    },
    dispose() {
    }
  };