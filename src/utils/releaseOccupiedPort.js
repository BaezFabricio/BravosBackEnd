const { execSync } = require('child_process');

function getListeningPids(port) {
  try {
    const output = execSync(`netstat -ano -p tcp`, {
      encoding: 'utf8',
      windowsHide: true,
    });

    const pids = new Set();
    const portPattern = new RegExp(`:${port}\\s+.*?(\\d+)\\s*$`);

    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .forEach((line) => {
        if (!line || !line.includes(`:${port}`)) {
          return;
        }

        const match = line.match(portPattern);
        const pid = Number(match && match[1]);

        if (Number.isInteger(pid)) {
          pids.add(pid);
        }
      });

    return [...pids];
  } catch (error) {
    return [];
  }
}

function isNodeProcess(pid) {
  try {
    const output = execSync(
      `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction Stop).ProcessName"`,
      {
      encoding: 'utf8',
      windowsHide: true,
      }
    );

    return output.toLowerCase().includes('node');
  } catch (error) {
    return false;
  }
}

function killProcess(pid) {
  execSync(
    `powershell -NoProfile -Command "Stop-Process -Id ${pid} -Force -ErrorAction Stop"`,
    {
      stdio: 'ignore',
      windowsHide: true,
    }
  );
}

async function releaseOccupiedPort(port, logger) {
  if (process.platform !== 'win32') {
    return;
  }

  const pids = getListeningPids(port);

  for (const pid of pids) {
    if (!isNodeProcess(pid)) {
      continue;
    }

    try {
      killProcess(pid);
      logger.warn(`Se cerró una instancia previa de Node en el puerto ${port} (PID ${pid}).`);
    } catch (error) {
      logger.warn(`No se pudo liberar el puerto ${port} desde el PID ${pid}: ${error.message}`);
    }
  }
}

module.exports = {
  releaseOccupiedPort,
};