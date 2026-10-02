(function () {
  var app = document.getElementById('app');
  var sessionSlot = document.getElementById('session-slot');
  var state = {
    user: null,
    users: [],
    employees: [],
    run: null,
    payslips: [],
    profile: null,
    payslipDetail: null,
    message: null,
    messageKind: 'ok'
  };

  function money(value) {
    return Number(value).toFixed(2);
  }

  var ROLE_LABELS = {
    payroll_viewer: 'Payroll viewer',
    payroll_processor: 'Payroll processor',
    payroll_closer: 'Payroll closer',
    employee: 'Employee'
  };

  var ROLE_ORDER = ['payroll_processor', 'payroll_closer', 'payroll_viewer', 'employee'];

  function roleLabel(roles) {
    if (!roles || !roles.length) return 'No role';
    return roles.map(function (code) {
      return ROLE_LABELS[code] || code;
    }).join(', ');
  }

  function workflowStage() {
    if (!state.run || state.run.status === 'closed') return 'closed';
    if (!state.payslips.length) return 'open';
    if (state.payslips.some(function (payslip) { return payslip.status === 'draft'; })) return 'draft';
    return 'final';
  }

  function workflowMarkup() {
    var stage = state.run ? workflowStage() : 'open';
    var steps = [
      ['open', 'Open run'],
      ['draft', 'Draft payslips'],
      ['final', 'All final'],
      ['closed', 'Closed']
    ];
    var order = { open: 0, draft: 1, final: 2, closed: 3 };
    var current = order[stage];
    return '<ol class="steps">' + steps.map(function (step, index) {
      var cls = index < current ? 'done' : index === current ? 'current' : '';
      return '<li class="' + cls + '">' + step[1] + '</li>';
    }).join('') + '</ol>';
  }

  function roleHint() {
    if (state.run && state.run.status === 'closed') {
      return 'This run is closed. Generate, finalise, and close are unavailable.';
    }
    if (hasRole('payroll_processor')) {
      return 'You can generate and finalise. Close stays available so you can see the server return 403.';
    }
    if (hasRole('payroll_closer')) {
      return 'You can close the run after every payslip is final. Generate and finalise are not this role.';
    }
    return 'You can read the run. Generate and finalise stay disabled. Close calls the server and returns 403.';
  }

  function hasRole(code) {
    return state.user && state.user.roles.indexOf(code) !== -1;
  }

  async function api(path, options) {
    options = options || {};
    var response = await fetch(path, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var text = await response.text();
    var body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      var error = new Error((body && body.error) || 'Request failed');
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function setMessage(text, kind) {
    state.message = text;
    state.messageKind = kind || 'ok';
  }

  async function refreshWorkspace() {
    var employees = await api('/api/employees');
    var runs = await api('/api/payroll-runs');
    state.employees = employees.employees;
    state.run = runs.payrollRuns[0] || null;
    state.payslips = [];
    if (state.run) {
      var payslips = await api('/api/payroll-runs/' + state.run.id + '/payslips');
      state.payslips = payslips.payslips;
    }
  }

  async function refreshSelfService() {
    var profile = await api('/api/my/profile');
    var listed = await api('/api/my/payslips');
    state.profile = profile.profile;
    state.payslips = listed.payslips;
    state.payslipDetail = null;
    if (state.payslips.length) {
      var detail = await api('/api/my/payslips/' + state.payslips[0].id);
      state.payslipDetail = detail.payslip;
    }
  }

  async function boot() {
    try {
      var me = await api('/api/me');
      state.user = me.user;
      if (hasRole('employee')) await refreshSelfService();
      else await refreshWorkspace();
    } catch (error) {
      if (!state.user || error.status === 401) {
        if (error.status !== 401) setMessage(error.message, 'error');
        state.user = null;
        var listed = await api('/api/demo-users');
        state.users = listed.users;
      } else {
        setMessage((error.status ? error.status + ' ' : '') + error.message, 'error');
      }
    }
    render();
  }

  async function login(userId) {
    try {
      await api('/api/login', { method: 'POST', body: { userId: userId } });
      setMessage(null);
      await boot();
    } catch (error) {
      setMessage(error.message, 'error');
      render();
    }
  }

  async function logout() {
    await api('/api/logout', { method: 'POST' });
    state.user = null;
    state.message = null;
    await boot();
  }

  async function runAction(work, successText) {
    try {
      await work();
      setMessage(successText, 'ok');
      await refreshWorkspace();
    } catch (error) {
      if (error.status === 403) {
        setMessage('403 Forbidden. The server rejected this action for your role.', 'error');
      } else if (error.status === 401) {
        setMessage('401 Authentication required.', 'error');
      } else {
        setMessage((error.status ? error.status + ' ' : '') + error.message, 'error');
      }
    }
    render();
  }

  function renderMessage() {
    if (!state.message) return '';
    return '<p class="banner ' + state.messageKind + '">' + escapeHtml(state.message) + '</p>';
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function identityTitle(user) {
    if (user.roles.indexOf('employee') !== -1) return 'Employee — ' + user.displayName;
    return user.displayName;
  }

  function identitySubtitle(user) {
    if (user.roles.indexOf('employee') !== -1) return 'Own payslips only';
    return roleLabel(user.roles);
  }

  function renderLogin() {
    sessionSlot.textContent = '';
    var users = state.users.slice().sort(function (a, b) {
      var aRole = ROLE_ORDER.indexOf(a.roles[0]);
      var bRole = ROLE_ORDER.indexOf(b.roles[0]);
      if (aRole !== bRole) return (aRole === -1 ? 9 : aRole) - (bRole === -1 ? 9 : bRole);
      return a.displayName.localeCompare(b.displayName);
    });
    var buttons = users.map(function (user) {
      return (
        '<button type="button" data-user-id="' + escapeHtml(user.id) + '">' +
          escapeHtml(identityTitle(user)) +
          '<br><span class="muted">' + escapeHtml(identitySubtitle(user)) + '</span>' +
        '</button>'
      );
    }).join('');
    app.innerHTML =
      renderMessage() +
      '<section class="card">' +
        '<h2>Choose a demo identity</h2>' +
        '<p class="muted">The server loads that person\'s role from the database. The browser does not choose the role.</p>' +
        '<div class="identity-list">' + buttons + '</div>' +
      '</section>';
    app.querySelectorAll('[data-user-id]').forEach(function (button) {
      button.addEventListener('click', function () {
        login(button.getAttribute('data-user-id'));
      });
    });
  }

  function renderWorkspace() {
    var run = state.run;
    sessionSlot.innerHTML =
      '<p class="who"><strong>' + escapeHtml(state.user.displayName) + '</strong>' +
      '<span class="muted">' + escapeHtml(roleLabel(state.user.roles)) + '</span></p>' +
      '<button type="button" class="secondary" id="logout">Sign out</button>';
    document.getElementById('logout').addEventListener('click', logout);

    var period = run ? run.periodStart + ' to ' + run.periodEnd : 'None';
    var status = run ? run.status : 'none';
    var closed = run && run.status === 'closed';
    var statusClass = closed ? 'status status-closed' : 'status status-open';
    var employeeRows = state.employees.map(function (employee) {
      return '<tr><td>' + escapeHtml(employee.employeeNumber) + '</td><td>' +
        escapeHtml(employee.firstName + ' ' + employee.lastName) + '</td><td>' +
        escapeHtml(employee.email) + '</td><td>' + money(employee.annualSalary) + '</td></tr>';
    }).join('');
    var payslipRows = state.payslips.map(function (payslip) {
      var finalise = '';
      if (hasRole('payroll_processor') && payslip.status === 'draft' && !closed) {
        finalise = '<button type="button" data-finalise="' + escapeHtml(payslip.id) + '">Finalise</button>';
      }
      return '<tr><td>' + escapeHtml(payslip.employeeName) + '</td><td>' + money(payslip.grossPay) +
        '</td><td>' + money(payslip.leaveDeduction) + '</td><td>' + money(payslip.allowances) +
        '</td><td>' + money(payslip.netPay) + '</td><td>' + escapeHtml(payslip.status) +
        '</td><td>' + finalise + '</td></tr>';
    }).join('');

    app.innerHTML =
      renderMessage() +
      '<section class="card"><dl class="panel">' +
        '<div><dt>Demo user</dt><dd>' + escapeHtml(state.user.displayName) + '</dd></div>' +
        '<div><dt>Role</dt><dd>' + escapeHtml(roleLabel(state.user.roles)) + '</dd></div>' +
        '<div><dt>Payroll period</dt><dd>' + escapeHtml(period) + '</dd></div>' +
        '<div><dt>Payroll status</dt><dd><span class="' + statusClass + '">' + escapeHtml(status) + '</span></dd></div>' +
      '</dl>' +
      workflowMarkup() +
      '<p class="formula">Toy formula: fortnightly pay = annual salary / 26. Unpaid leave deducts annual salary / 260 per day. Net = gross − leave deduction + allowance.</p></section>' +
      '<section class="card"><h2>Actions</h2><div class="actions">' +
        '<button type="button" id="generate"' + (hasRole('payroll_processor') && run && !closed && state.payslips.length === 0 ? '' : ' disabled') + '>Generate draft payslips</button>' +
        '<button type="button" id="close"' + (closed ? ' disabled' : '') + '>Close payroll</button>' +
      '</div>' +
      '<p class="muted">' + escapeHtml(roleHint()) + ' A closer can close only after every payslip is final. A closed run cannot be changed.</p></section>' +
      '<section class="card"><h2>Employees</h2><table><thead><tr><th>Number</th><th>Name</th><th>Email</th><th>Annual salary</th></tr></thead><tbody>' +
        employeeRows + '</tbody></table></section>' +
      '<section class="card"><h2>Payslips</h2>' +
        (state.payslips.length
          ? '<table><thead><tr><th>Employee</th><th>Gross</th><th>Leave deduction</th><th>Allowances</th><th>Net</th><th>Status</th><th></th></tr></thead><tbody>' + payslipRows + '</tbody></table>'
          : '<p class="muted">No payslips yet.</p>') +
      '</section>';

    document.getElementById('generate').addEventListener('click', function () {
      if (!run) return;
      runAction(function () {
        return api('/api/payroll-runs/' + run.id + '/generate', { method: 'POST' });
      }, 'Draft payslips created.');
    });
    document.getElementById('close').addEventListener('click', function () {
      if (!run) return;
      runAction(function () {
        return api('/api/payroll-runs/' + run.id + '/close', { method: 'POST' });
      }, 'Payroll run closed.');
    });
    app.querySelectorAll('[data-finalise]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-finalise');
        runAction(function () {
          return api('/api/payslips/' + id + '/finalise', { method: 'POST' });
        }, 'Payslip finalised.');
      });
    });
  }

  function payslipLines(detail) {
    var lines = [
      ['Employee', detail.employeeName],
      ['Period', detail.periodStart + ' to ' + detail.periodEnd],
      ['Gross pay', money(detail.grossPay)]
    ];
    if (detail.leaveDeduction > 0) lines.push(['Unpaid leave', money(detail.leaveDeduction)]);
    if (detail.allowances > 0) lines.push(['Allowance', money(detail.allowances)]);
    lines.push(['Resulting pay', money(detail.netPay)]);
    lines.push(['Status', detail.status]);
    return lines.map(function (line) {
      return '<div><dt>' + escapeHtml(line[0]) + '</dt><dd>' + escapeHtml(line[1]) + '</dd></div>';
    }).join('');
  }

  function renderSelfService() {
    var profile = state.profile;
    sessionSlot.innerHTML =
      '<p class="who"><strong>' + escapeHtml(state.user.displayName) + '</strong>' +
      '<span class="muted">' + escapeHtml(roleLabel(state.user.roles)) + '</span></p>' +
      '<button type="button" class="secondary" id="logout">Sign out</button>';
    document.getElementById('logout').addEventListener('click', logout);

    var profileMarkup = profile
      ? '<dl class="panel">' +
          '<div><dt>Employee</dt><dd>' + escapeHtml(profile.firstName + ' ' + profile.lastName) + '</dd></div>' +
          '<div><dt>Role</dt><dd>Employee</dd></div>' +
          '<div><dt>Number</dt><dd>' + escapeHtml(profile.employeeNumber) + '</dd></div>' +
          '<div><dt>Email</dt><dd>' + escapeHtml(profile.email) + '</dd></div>' +
        '</dl>'
      : '<p class="muted">Profile unavailable.</p>';

    var list = state.payslips.map(function (payslip) {
      var selected = state.payslipDetail && state.payslipDetail.id === payslip.id ? ' secondary' : '';
      return '<button type="button" class="' + selected + '" data-payslip="' + escapeHtml(payslip.id) + '">' +
        escapeHtml(payslip.periodStart + ' to ' + payslip.periodEnd) +
        ' · ' + escapeHtml(payslip.status) +
      '</button>';
    }).join('');

    app.innerHTML =
      renderMessage() +
      '<section class="card"><h2>Your profile</h2>' + profileMarkup +
      '<p class="muted">This view calls /api/my/profile and /api/my/payslips. The server uses the employee linked to this session.</p></section>' +
      '<section class="card"><h2>Your payslips</h2>' +
        (state.payslips.length
          ? '<div class="actions">' + list + '</div>'
          : '<p class="muted">No payslips yet. A payroll processor generates them for the open run.</p>') +
        (state.payslipDetail
          ? '<dl class="panel payslip">' + payslipLines(state.payslipDetail) + '</dl>'
          : '') +
      '</section>';

    app.querySelectorAll('[data-payslip]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-payslip');
        api('/api/my/payslips/' + id).then(function (detail) {
          state.payslipDetail = detail.payslip;
          state.message = null;
          render();
        }).catch(function (error) {
          setMessage((error.status ? error.status + ' ' : '') + error.message, 'error');
          render();
        });
      });
    });
  }

  function render() {
    if (!state.user) renderLogin();
    else if (hasRole('employee')) renderSelfService();
    else renderWorkspace();
  }

  boot();
})();
