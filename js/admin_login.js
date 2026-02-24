/**
 * Admin Login Logic
 */
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('adminLoginForm');
    const loginError = document.getElementById('loginError');

    // Expected credentials
    const expectedUsername = 'tbatail';
    const expectedPassword = '28Avril2013?@';

    // If already logged in, redirect to RDV page
    if (sessionStorage.getItem('adminToken') === 'true') {
        window.location.href = 'admin_rdv.html';
    }

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const usernameInput = document.getElementById('username').value;
        const passwordInput = document.getElementById('password').value;

        if (usernameInput === expectedUsername && passwordInput === expectedPassword) {
            // Success
            sessionStorage.setItem('adminToken', 'true');
            window.location.href = 'admin_rdv.html';
        } else {
            // Failure
            loginError.style.display = 'block';
            document.getElementById('password').value = ''; // clear password
        }
    });
});
