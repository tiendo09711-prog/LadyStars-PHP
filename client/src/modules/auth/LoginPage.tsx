import { type FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { http } from '../../core/api/http';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = 'Đăng nhập • LadyStars';
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const response = await http.post('/auth/login', { email, password });
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('lastLoginEmail', response.data.user?.email ?? email);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-scene" aria-hidden="true">
        <span className="login-orb login-orb-1" />
        <span className="login-orb login-orb-2" />
        <span className="login-orb login-orb-3" />
        <div className="login-stars">
          <span /><span /><span /><span /><span /><span /><span /><span />
        </div>
        <span className="login-grid" />
      </div>

      <form className="login-card" onSubmit={submit} autoComplete="off">
        <div className="login-card-badge">
          <img src="/logo.jpg" alt="LadyStars" className="login-card-logo" />
        </div>
        <header className="login-card-head">
          <h1>LadyStars ERP</h1>
          <p>Đăng nhập hệ thống quản trị</p>
        </header>

        <div className="login-field">
          <label htmlFor="login-email" className="login-field-label">Email</label>
          <div className="login-input">
            <Mail size={18} className="login-input-icon" />
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              placeholder="ban@ladystars.vn"
            />
          </div>
        </div>

        <div className="login-field">
          <label htmlFor="login-password" className="login-field-label">Mật khẩu</label>
          <div className="login-input">
            <LockKeyhole size={18} className="login-input-icon" />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
            />
            <button
              type="button"
              className="login-input-toggle"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && <div className="login-error" role="alert">{error}</div>}

        <button className="login-submit" type="submit" disabled={loading}>
          {loading ? (
            <Loader2 size={18} className="login-spin" />
          ) : (
            <>
              <span>Đăng nhập</span>
              <ArrowRight size={18} />
            </>
          )}
        </button>

        <p className="login-card-foot">&copy; {new Date().getFullYear()} LadyStars</p>
      </form>
    </div>
  );
}
