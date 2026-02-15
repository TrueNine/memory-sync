// feature/auth/build.gradle.kts
dependencies {
  implementation(projects.core.common)
  implementation(projects.core.domain)

  // 禁止：字符串引用无编译期检查
  // implementation(project(":core:common"))
}
