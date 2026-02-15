dependencies {
  implementation(platform(libs.io.ktor.bom))
  implementation(libs.io.ktor.server.core)   // 版本由 BOM 管理
  implementation(libs.io.ktor.server.netty)
}
