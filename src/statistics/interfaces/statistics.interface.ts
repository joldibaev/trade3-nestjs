export interface DashboardStats {
  sales: {
    total: number;
    diff: number;
  };
  orders: {
    active: number;
    waiting: number;
  };
  clients: {
    total: number;
    new: number;
  };
  inventory: {
    critical: number;
  };
  chart: {
    label: string;
    value: number;
  }[];
}
