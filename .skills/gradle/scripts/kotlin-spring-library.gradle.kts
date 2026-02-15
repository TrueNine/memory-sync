// build-logic/src/main/kotlin/kotlin-spring-library.gradle.kts
// 组合模式 — Plugin 叠加
plugins {
  id("kotlin-library")
  kotlin("plugin.spring")
  kotlin("plugin.serialization")
}
