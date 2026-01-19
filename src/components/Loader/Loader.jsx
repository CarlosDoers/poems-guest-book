import './Loader.css';

export default function Loader() {
  return (
    <div className="loader-wrapper">
      <div className="loader-orbit" aria-hidden="true" />
      <div className="loader-blob"></div>
    </div>
  );
}
