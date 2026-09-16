// ================================================
// INICIALIZACIÓN SEGURA - Todo dentro del DOMContentLoaded
// ================================================
document.addEventListener('DOMContentLoaded', function () {

    // --- Inicializar Supabase de forma segura ---
    let supabase;
    try {
        var supabaseUrl = 'https://bfburrriwaetdxperzsv.supabase.co';
        var supabaseKey = 'sb_publishable_EQsnuLxEKRqskyQJl5WfBg_HrWn0X2F';
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        console.log('Supabase inicializado correctamente');
    } catch (e) {
        alert('Error crítico: No se pudo cargar la librería de base de datos.\n\n' + e.message);
        return;
    }

    // ================================================
    // ESTADO DE LA APLICACIÓN
    // ================================================
    var currentView = 'auth';
    var currentUser = null;

    // ================================================
    // NAVEGACIÓN
    // ================================================
    function navigate(viewId) {
        var oldView = document.getElementById('view-' + currentView);
        if (oldView) oldView.classList.remove('active');
        currentView = viewId;
        var newView = document.getElementById('view-' + currentView);
        if (newView) {
            newView.classList.add('active');
        } else {
            console.error('Vista no encontrada: view-' + viewId);
            return;
        }
        if (viewId === 'auth') {
            document.body.classList.add('is-login-screen');
        } else {
            document.body.classList.remove('is-login-screen');
        }
        if (viewId === 'base') renderDashboard();
        if (viewId === 'admin') renderAdminDashboard();
    }

    // ================================================
    // VERIFICAR SESIÓN GUARDADA
    // ================================================
    try {
        var stored = localStorage.getItem('appUser');
        if (stored) {
            var parsed = JSON.parse(stored);
            if (parsed && parsed.role) {
                currentUser = parsed;
                navigate(parsed.role);
            } else {
                localStorage.removeItem('appUser');
            }
        }
    } catch (e2) {
        localStorage.removeItem('appUser');
    }

    // ================================================
    // LOGIN
    // ================================================
    async function login() {
        var username = document.getElementById('login-email').value.trim();
        var password = document.getElementById('login-password').value;
        var btn = document.getElementById('btn-login');

        if (!username || !password) {
            showToast('Completa todos los campos', 'error');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Iniciando...';

        try {
            var result = await supabase
                .from('usuarios')
                .select('*')
                .eq('username', username)
                .eq('password', password)
                .single();

            if (result.error) {
                throw new Error('Error Supabase: ' + result.error.message);
            }
            if (!result.data) {
                throw new Error('Usuario o contraseña incorrectos');
            }

            currentUser = result.data;
            localStorage.setItem('appUser', JSON.stringify(result.data));
            showToast('¡Bienvenido, ' + result.data.username + '!');
            document.getElementById('form-login').reset();
            navigate(result.data.role);

        } catch (err) {
            console.error('Login error:', err);
            alert('No se pudo ingresar.\n\nDetalle: ' + err.message + '\n\n¿Ya ejecutaste el SQL en Supabase?');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Ingresar';
        }
    }

    // ================================================
    // CERRAR SESIÓN
    // ================================================
    function logout() {
        localStorage.removeItem('appUser');
        currentUser = null;
        navigate('auth');
        showToast('Sesión cerrada');
    }

    // ================================================
    // CREAR USUARIO (ADMIN)
    // ================================================
    async function adminCreateUser(e) {
        e.preventDefault();
        var username = document.getElementById('new-username').value.trim();
        var password = document.getElementById('new-password').value;
        var role = document.getElementById('new-role').value;
        var btn = e.target.querySelector('button[type="submit"]');

        btn.disabled = true;
        btn.textContent = 'Creando...';

        try {
            var res = await supabase
                .from('usuarios')
                .insert([{ username: username, password: password, role: role }]);

            if (res.error) {
                if (res.error.code === '23505') throw new Error('Ese nombre de usuario ya existe');
                throw res.error;
            }

            showToast('Usuario "' + username + '" creado exitosamente');
            e.target.reset();
        } catch (err) {
            console.error('Error creando usuario:', err);
            showToast('Error: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Crear Usuario';
        }
    }

    // ================================================
    // SUBIR ARCHIVO
    // ================================================
    async function uploadFile(file) {
        var fileExt = file.name.split('.').pop();
        var fileName = Math.random().toString(36).substring(2) + '-' + Date.now() + '.' + fileExt;
        var filePath = 'actas/' + fileName;
        var up = await supabase.storage.from('evidencias').upload(filePath, file);
        if (up.error) throw up.error;
        var pub = supabase.storage.from('evidencias').getPublicUrl(filePath);
        return pub.data.publicUrl;
    }

    // ================================================
    // ENVIAR VOTO
    // ================================================
    async function submitVote(e) {
        e.preventDefault();
        var establecimiento = document.getElementById('establecimiento-mesa').value.trim();
        var junta = document.getElementById('numero-junta').value;
        var votos = document.getElementById('cantidad-votos').value;
        var fileInput = document.getElementById('evidencia-archivo');
        var btnSubmit = e.target.querySelector('button[type="submit"]');

        if (!fileInput.files.length) { showToast('Debes adjuntar la evidencia del acta.', 'error'); return; }
        if (!currentUser) { showToast('Tu sesión ha expirado', 'error'); logout(); return; }

        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Subiendo...';

        try {
            var publicUrl = await uploadFile(fileInput.files[0]);
            var ins = await supabase.from('votos').insert([{
                establecimiento: establecimiento,
                junta_numero: parseInt(junta),
                cantidad_votos: parseInt(votos),
                evidencia_url: publicUrl,
                user_id: currentUser.id
            }]);
            if (ins.error) throw ins.error;
            e.target.reset();
            document.getElementById('file-name').textContent = 'Toca aquí para seleccionar un archivo';
            document.querySelector('.file-upload-wrapper').classList.remove('has-file');
            showToast('Resultados enviados correctamente');
        } catch (err) {
            console.error('Error al subir:', err);
            showToast('Error: ' + err.message, 'error');
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Enviar Resultados';
        }
    }

    // ================================================
    // DASHBOARD
    // ================================================
    async function renderDashboard() {
        var tbody = document.getElementById('registros-tbody');
        var emptyState = document.getElementById('empty-state');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando datos...</td></tr>';
        try {
            var res = await supabase.from('votos').select('*').order('created_at', { ascending: false });
            if (res.error) throw res.error;
            var records = res.data;
            var totalVotos = records.reduce(function(s, r) { return s + r.cantidad_votos; }, 0);
            animateNumber('total-votos', totalVotos);
            animateNumber('total-mesas', records.length);
            tbody.innerHTML = '';
            if (records.length === 0) {
                emptyState.style.display = 'block';
            } else {
                emptyState.style.display = 'none';
                records.forEach(function(rec) {
                    var t = new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    var tr = document.createElement('tr');
                    tr.innerHTML = '<td><strong>Mesa ' + rec.junta_numero + '</strong><br><span style="color:var(--text-muted);font-size:0.8rem;">' + (rec.establecimiento || '—') + '</span></td>' +
                        '<td style="color:var(--success);font-weight:bold;">' + rec.cantidad_votos + '</td>' +
                        '<td style="color:var(--text-muted);font-size:0.85rem;">' + t + '</td>' +
                        '<td><button class="btn-view-doc" onclick="window._openModal(\'' + rec.evidencia_url + '\')">Ver Acta</button></td>';
                    tbody.appendChild(tr);
                });
            }
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="4" style="color:red;text-align:center;">Error: ' + err.message + '</td></tr>';
        }
    }

    function animateNumber(id, end) {
        var obj = document.getElementById(id);
        if (!obj) return;
        var dur = 1000, ts = null;
        var step = function(t) {
            if (!ts) ts = t;
            var p = Math.min((t - ts) / dur, 1);
            obj.innerHTML = Math.floor((1 - Math.pow(1 - p, 4)) * end);
            if (p < 1) window.requestAnimationFrame(step); else obj.innerHTML = end;
        };
        window.requestAnimationFrame(step);
    }

    window._openModal = function(url) {
        var mb = document.getElementById('modal-body-content');
        mb.innerHTML = '';
        if (url.toLowerCase().endsWith('.pdf')) {
            var iframe = document.createElement('iframe');
            iframe.src = url; mb.appendChild(iframe);
        } else {
            var img = document.createElement('img');
            img.src = url; img.alt = 'Acta'; mb.appendChild(img);
        }
        document.getElementById('modal-evidencia').classList.add('active');
    };

    window._closeModal = function() {
        document.getElementById('modal-evidencia').classList.remove('active');
        setTimeout(function() { document.getElementById('modal-body-content').innerHTML = ''; }, 300);
    };

    function showToast(msg, type) {
        var t = document.getElementById('toast');
        t.textContent = msg;
        t.className = 'toast show ' + (type || 'success');
        setTimeout(function() { t.className = 'toast'; }, 3000);
    }

    window.app = { logout: logout };

    // ================================================
    // ADMIN DASHBOARD
    // ================================================
    var adminChart = null;

    async function renderAdminDashboard() {
        // Load stats and users in parallel
        try {
            var [votosRes, usersRes] = await Promise.all([
                supabase.from('votos').select('*').order('junta_numero'),
                supabase.from('usuarios').select('*').order('username')
            ]);

            // Stats
            if (!votosRes.error) {
                var totalVotos = votosRes.data.reduce(function(s, r) { return s + r.cantidad_votos; }, 0);
                document.getElementById('admin-total-votos').textContent = totalVotos.toLocaleString();
                document.getElementById('admin-total-mesas').textContent = votosRes.data.length;
                renderAdminChart(votosRes.data);
            }

            if (!usersRes.error) {
                document.getElementById('admin-total-usuarios').textContent = usersRes.data.length;
                renderUsersTable(usersRes.data);
            }
        } catch(e) {
            console.error('Error cargando admin dashboard:', e);
        }
    }

    function renderAdminChart(records) {
        var canvas = document.getElementById('chart-votos');
        var emptyMsg = document.getElementById('chart-empty');

        if (records.length === 0) {
            canvas.style.display = 'none';
            emptyMsg.style.display = 'block';
            return;
        }

        canvas.style.display = 'block';
        emptyMsg.style.display = 'none';

        var labels = records.map(function(r) {
            return r.establecimiento ? r.establecimiento + ' (M' + r.junta_numero + ')' : 'Mesa ' + r.junta_numero;
        });
        var data = records.map(function(r) { return r.cantidad_votos; });

        if (adminChart) adminChart.destroy();

        adminChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Votos',
                    data: data,
                    backgroundColor: 'rgba(10, 37, 64, 0.8)',
                    borderColor: 'rgba(10, 37, 64, 1)',
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) { return ' ' + ctx.parsed.y + ' votos'; }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    function renderUsersTable(users) {
        var tbody = document.getElementById('users-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:20px;">No hay usuarios creados.</td></tr>';
            return;
        }

        users.forEach(function(u) {
            var roleLabels = { admin: 'Admin', mesa: 'Mesa Receptora', base: 'Equipo Base' };
            var tr = document.createElement('tr');
            var deleteBtn = u.role !== 'admin'
                ? '<button class="btn-delete" onclick="window._deleteUser(\'' + u.id + '\', \'' + u.username + '\')">Eliminar</button>'
                : '<span style="color:var(--text-muted); font-size:0.8rem;">—</span>';

            tr.innerHTML =
                '<td><strong>' + u.username + '</strong></td>' +
                '<td><span class="role-badge ' + u.role + '">' + (roleLabels[u.role] || u.role) + '</span></td>' +
                '<td>' + deleteBtn + '</td>';
            tbody.appendChild(tr);
        });
    }

    async function deleteUser(userId, username) {
        if (!confirm('¿Estás seguro de que quieres eliminar al usuario "' + username + '"?')) return;

        try {
            var res = await supabase.from('usuarios').delete().eq('id', userId);
            if (res.error) throw res.error;
            showToast('Usuario "' + username + '" eliminado');
            renderAdminDashboard(); // Refresh
        } catch(e) {
            showToast('Error al eliminar: ' + e.message, 'error');
        }
    }

    window._deleteUser = deleteUser;
    window._reloadUsers = renderAdminDashboard;

    // ================================================
    // VINCULAR EVENTOS
    // ================================================
    var btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', function(e) {
            e.preventDefault();
            login();
        });
    }
    var cuForm = document.getElementById('form-create-user');
    if (cuForm) cuForm.addEventListener('submit', adminCreateUser);
    var mForm = document.getElementById('form-mesa');
    if (mForm) mForm.addEventListener('submit', submitVote);
    var fInput = document.getElementById('evidencia-archivo');
    if (fInput) {
        fInput.addEventListener('change', function(e) {
            var fn = document.getElementById('file-name');
            var fw = document.querySelector('.file-upload-wrapper');
            if (e.target.files.length > 0) { fn.textContent = e.target.files[0].name; fw.classList.add('has-file'); }
            else { fn.textContent = 'Toca aquí para seleccionar un archivo'; fw.classList.remove('has-file'); }
        });
    }

    console.log('App lista. Vista:', currentView);
});
