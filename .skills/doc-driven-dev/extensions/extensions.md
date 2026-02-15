## Extension Doc System

Four core docs cover general scenarios, specific project types can add extension docs as needed.

### Extension Doc Index

| Doc | Applicable Scenarios | Number |
|-----|---------------------|--------|
| [ui-design.md](ui-design.md) | Frontend/Mobile/Desktop/Full-stack | 04 |
| [api-spec.md](api-spec.md) | Backend/Full-stack/Microservices | 05 |
| [database-design.md](database-design.md) | Backend/Full-stack/Data-intensive | 06 |
| [data-dictionary.md](data-dictionary.md) | Multi-system integration/Terminology unification | 07 |
| [page-design.md](page-design.md) | Frontend/Mobile/Desktop/Mini-program/Extension | 08 |

### Project Types and Recommended Docs

| Project Type | Core Docs | Recommended Extensions |
|--------------|-----------|----------------------|
| Pure Backend API | 00-03 | API Spec, Database Design |
| Frontend SPA | 00-03 | UI Design, Page Design |
| Full-stack App | 00-03 | UI Design, Page Design, API Spec, Database Design |
| Mobile App | 00-03 | UI Design, Page Design |
| Mini-program (Taro/uni-app/Native) | 00-03 | UI Design, Page Design |
| Desktop App | 00-03 | UI Design, Page Design |
| Browser Extension | 00-03 | UI Design, Page Design |
| Data Platform | 00-03 | Database Design, Data Dictionary |
| Microservices | 00-03 | API Spec, Database Design |

### Extension Directory Structure

```
.docs/
├── 00_Product_Context.md     # Required
├── 01_System_Architecture.md # Required
├── 02_Implementation_Plan.md # Required
├── 03_Current_Status.md      # Required
├── 04_UI_Design.md           # Optional: design system variables
├── 05_API_Spec.md            # Optional: API spec
├── 06_Database_Design.md     # Optional: database design
├── 07_Data_Dictionary.md     # Optional: data dictionary
└── 08_Page_Design.md         # Optional: page routing and skeleton
```

### When to Add Extension Docs

**At project start** determine project type, add relevant extension docs immediately after creating core docs.

**UI Design vs Page Design**:
- UI Design: Design system base variables (colour/typography/spacing/animation), for AI design tools to generate mockups
- Page Design: Page structure and routing (route architecture/page skeleton/navigation flow), for developers to implement

**MUST NOT**:
- Add Database Design for pure frontend projects
- Add UI Design / Page Design for pure backend projects
- Add extension docs unrelated to project
