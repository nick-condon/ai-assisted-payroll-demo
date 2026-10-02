import {
  calculatePayslip,
  dailyRate,
  fortnightlyBasePay,
  unpaidLeaveDeduction
} from '../src/services/payrollCalculator.js';

describe('toy payroll calculation', () => {
  test('divides an even annual salary into a fortnight', () => {
    expect(fortnightlyBasePay(2600)).toBe(100);
    expect(calculatePayslip({
      annualSalary: 2600,
      unpaidLeaveDays: 0,
      allowanceAmount: 0
    })).toEqual({
      grossPay: 100,
      leaveDeduction: 0,
      allowances: 0,
      netPay: 100
    });
  });

  test('deducts unpaid leave at annual salary / 260 per day', () => {
    expect(dailyRate(2600)).toBe(10);
    expect(unpaidLeaveDeduction(2600, 2)).toBe(20);
    expect(calculatePayslip({
      annualSalary: 2600,
      unpaidLeaveDays: 2,
      allowanceAmount: 0
    })).toEqual({
      grossPay: 100,
      leaveDeduction: 20,
      allowances: 0,
      netPay: 80
    });
  });

  test('adds an allowance after the leave deduction', () => {
    expect(calculatePayslip({
      annualSalary: 2600,
      unpaidLeaveDays: 2,
      allowanceAmount: 50
    })).toEqual({
      grossPay: 100,
      leaveDeduction: 20,
      allowances: 50,
      netPay: 130
    });
  });

  test('rounds the synthetic 1000 annual salary to cents', () => {
    expect(calculatePayslip({
      annualSalary: 1000,
      unpaidLeaveDays: 2,
      allowanceAmount: 0
    })).toEqual({
      grossPay: 38.46,
      leaveDeduction: 7.7,
      allowances: 0,
      netPay: 30.76
    });
  });
});
