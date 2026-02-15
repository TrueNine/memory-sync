import kotlin.jvm.optionals.getOrNull

plugins {
  `java-platform`
  id("buildlogic.maven-publish-conventions")
}

dependencies {
  constraints {
    val catalog = rootProject.extensions
      .getByType<VersionCatalogsExtension>()
      .named("libs")

    catalog.libraryAliases.forEach { alias ->
      catalog.findLibrary(alias).getOrNull()?.get()?.also { dep ->
        api(dep)
      }
    }
  }
}
