const { app, screen } = require('electron');
const fs = require('fs');
app.whenReady().then(() => {
  const out = [];
  for (const d of screen.getAllDisplays()) {
    out.push({ id: d.id, label: d.label, scaleFactor: d.scaleFactor, bounds: d.bounds, workArea: d.workArea, internal: d.internal });
  }
  fs.writeFileSync(require('path').join(__dirname, '..', 'reports', 'probe-displays-now.json'), JSON.stringify(out, null, 2));
  app.exit(0);
});
