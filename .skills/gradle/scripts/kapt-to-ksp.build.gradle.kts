// 迁移前 (kapt) — 仅遗留项目
// plugins {
//   kotlin("kapt")
// }
// dependencies {
//   kapt(libs.dagger.compiler)
// }

// 迁移后 (KSP)
plugins {
  alias(libs.plugins.ksp)
}
dependencies {
  ksp(libs.dagger.compiler)
}
