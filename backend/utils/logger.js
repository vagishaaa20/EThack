let logs = [];

export const logAgent = (agent, action) => {
  const entry = `[${agent}] ${action}`;
  console.log(entry);

  logs.push(entry);
};

export const getLogs = () => logs;

export const clearLogs = () => {
  logs = [];
};