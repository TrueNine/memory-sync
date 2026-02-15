rootProject.name = rootDir.name

enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")

plugins {
  id("org.gradle.toolchains.foojay-resolver-convention") version "+"
  id("site.addzero.gradle.plugin.modules-buddy") version "+"
}

pluginManagement {
  includeBuild("build-logic")
  repositories {
    mavenCentral()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    mavenCentral()
  }
}
