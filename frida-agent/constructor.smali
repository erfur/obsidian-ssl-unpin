
# static constructor
.method static constructor <clinit>()V
    .locals 1

    .prologue
    const-string v0, "gadget"

    invoke-static {v0}, Ljava/lang/System;->loadLibrary(Ljava/lang/String;)V

    return-void
.end method
