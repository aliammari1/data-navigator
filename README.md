# AI-Powered Data Dashboard

An advanced, enterprise-grade data analysis and visualization platform that surpasses Microsoft's Data Formulator with cutting-edge AI capabilities, real-time collaboration, and comprehensive data lineage tracking.

## 🚀 Key Features

### AI-Powered Analysis
- **Natural Language Queries**: Ask questions about your data in plain English
- **Anomaly Detection**: Automatic identification of outliers with severity classification
- **Predictive Analytics**: 14-day forecasting with confidence intervals
- **Correlation Analysis**: Discover relationships between variables automatically
- **Smart Insights**: AI-generated actionable recommendations

### Data Lineage & Provenance
- **Visual Lineage Graph**: Interactive flow diagram of data transformations
- **Impact Analysis**: Understand upstream and downstream dependencies
- **Version Control**: Track all changes with complete history
- **Audit Trail**: Know who changed what and when
- **Critical Path Detection**: Identify high-impact data flows

### Real-time Collaboration
- **Multi-user Editing**: Work together with live presence indicators
- **Threaded Comments**: Discuss insights with your team
- **Activity Feed**: Track all changes in real-time
- **Version History**: Restore previous versions
- **Role-based Access**: Owner, Editor, and Viewer permissions

### Advanced Visualizations
- **Interactive Charts**: Line, area, bar, scatter, and composed charts
- **Real-time Updates**: Live data streaming and processing
- **GPU-Ready**: Architecture supports millions of data points
- **Responsive Design**: Works on all devices

## 🛠️ Tech Stack

- **Framework**: Next.js 16 with React 19
- **Language**: TypeScript
- **Styling**: TailwindCSS 4
- **UI Components**: Shadcn/ui
- **Charts**: Recharts, D3.js
- **AI/ML**: TensorFlow.js
- **Collaboration**: Yjs (CRDT)
- **State**: Zustand
- **Data Processing**: PapaParse, XLSX

## 📦 Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 🎯 Getting Started

1. Navigate to `http://localhost:3000/dashboard`
2. Explore the AI Analysis page for intelligent insights
3. Check Data Lineage to understand your data flow
4. Use Collaborative workspace for team analysis

## 📊 Features by Page

### AI Analysis (`/dashboard/ai-analysis`)
- Natural language query interface
- Anomaly detection with severity levels
- Predictive forecasting
- Correlation analysis
- Real-time processing metrics
- Automated insights

### Data Lineage (`/dashboard/lineage`)
- Interactive graph visualization
- Impact analysis
- Version history
- Metadata management
- Search and filtering

### Collaborative (`/dashboard/collaborative`)
- Real-time presence
- Threaded comments
- Activity feed
- Version control
- Team management

## 🔧 Configuration

The dashboard is ready to use out of the box. For advanced configuration:

1. **Data Sources**: Configure in `src/lib/stores/`
2. **AI Models**: Adjust in AI analysis page
3. **Collaboration**: Set up WebSocket server for real-time sync

## ✅ Quality Gates

```bash
# Validate dependency boundaries with Dependency Cruiser
pnpm run check:deps

# Print a Mermaid dependency graph
pnpm run deps:graph
```

Dependency Cruiser is configured in `.dependency-cruiser.js` for the app source,
Electron entrypoints, scripts, and Storybook config. It enforces resolvable
imports, package declarations, and test/story isolation, while reporting the
local architecture boundaries documented in `CONTEXT.md`.

## 🎨 Storybook and Figma

Storybook uses `@storybook/addon-designs` so component stories can show linked
Figma designs in the Design panel. Update `.storybook/figma-links.ts` with the
real Data Navigator Figma file URL and node IDs, then add `design:
figmaDesign(figmaLinks.componentName)` to component story `parameters`.

## 📈 Performance

- Handles 1M+ data points with virtual scrolling
- < 100ms interaction response time
- Real-time updates with < 50ms latency
- Efficient memory usage

## 🔒 Security

- Role-based access control
- Audit logging
- Secure state management
- Ready for OAuth integration

## 🚀 Future Enhancements

- GPU acceleration with Deck.gl
- Custom ML model training
- API integrations
- Mobile app
- Plugin system
- Data catalog

## 📝 Documentation

See `IMPLEMENTATION_SUMMARY.md` for detailed implementation notes and `.kiro/specs/ai-powered-data-dashboard/requirements.md` for complete requirements.

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines first.

## 🦋 Versioning and releases

Data Navigator uses [Changesets](https://github.com/changesets/changesets) to
version the private desktop application and generate `CHANGELOG.md`.

Add a release note with:

```bash
pnpm changeset
```

Use `patch` for compatible fixes, `minor` for backward-compatible features, and
`major` for breaking changes. Commit the generated `.changeset/*.md` file with
the implementation.

On `main`, the release workflow maintains a version pull request. Merging that
pull request updates the application version and changelog, creates a
`data-navigator@x.y.z` Git tag, and publishes a GitHub Release. Because this is a
private application package, nothing is published to npm.

Useful commands:

```bash
pnpm changeset
pnpm run changeset:status
pnpm run version:app
pnpm run release
```

---

Built with ❤️ using Next.js, React, and TensorFlow.js
