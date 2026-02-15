plugins {
  `kotlin-dsl`
}

dependencies {
  // Convention Plugin 内部需要 apply 的插件在此声明
  // libs.versions.toml 中需声明对应 library 指向插件 Maven 坐标
  implementation(libs.kotlin.gradle.plugin)
  implementation(libs.kotlin.serialization.plugin)
}
