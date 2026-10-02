/**
 * Demonstration payroll formula only.
 *
 * fortnightly base pay = annual salary / 26
 * daily rate = annual salary / 260
 * unpaid leave deduction = daily rate × unpaid days
 * net pay = gross pay − unpaid leave deduction + allowances
 *
 * Amounts are rounded to cents. This is not a statutory payroll calculation.
 */

export type PayslipCalculation = {
  grossPay: number;
  leaveDeduction: number;
  allowances: number;
  netPay: number;
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function fortnightlyBasePay(annualSalary: number): number {
  return roundMoney(annualSalary / 26);
}

export function dailyRate(annualSalary: number): number {
  return roundMoney(annualSalary / 260);
}

export function unpaidLeaveDeduction(annualSalary: number, unpaidDays: number): number {
  return roundMoney(dailyRate(annualSalary) * unpaidDays);
}

export function calculatePayslip(input: {
  annualSalary: number;
  unpaidLeaveDays: number;
  allowanceAmount: number;
}): PayslipCalculation {
  const grossPay = fortnightlyBasePay(input.annualSalary);
  const leaveDeduction = unpaidLeaveDeduction(input.annualSalary, input.unpaidLeaveDays);
  const allowances = roundMoney(input.allowanceAmount);
  const netPay = roundMoney(grossPay - leaveDeduction + allowances);
  return { grossPay, leaveDeduction, allowances, netPay };
}
