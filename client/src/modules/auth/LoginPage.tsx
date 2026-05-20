import { type FormEvent, useState } from 'react';
import { LockKeyhole, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { http } from '../../core/api/http';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const response = await http.post('/auth/login', { email, password });
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('lastLoginEmail', response.data.user?.email ?? email);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Đăng nhập thất bại.');
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit} autoComplete="off">
        <div className="login-logo"><LockKeyhole size={26} /></div>
        <h1>LadyStars ERP</h1>
        <p>Đăng nhập hệ thống quản trị</p>
        <label className="form-field wide">
          <span>Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
        </label>
        <label className="form-field wide">
          <span>Mật khẩu</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary full" type="submit">
          <LogIn size={16} /> Đăng nhập
        </button>
      </form>
    </div>
  );
}
