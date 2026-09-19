from flask import Flask, jsonify
from flask_cors import CORS
from backend.app.config import Config
from backend.app.db.connection import init_db

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialize CORS with an explicit origin allowlist. "*" combined with
    # supports_credentials=True is invalid: browsers reject the response and
    # any origin would be allowed to make cookie-authenticated calls.
    CORS(app, supports_credentials=True, origins=Config.CORS_ORIGINS)

    # Initialize DB connection pool
    init_db()

    # Register blueprints
    from backend.app.api.health import health_bp
    from backend.app.api.auth import auth_bp
    from backend.app.api.repositories import repos_bp
    from backend.app.api.analysis import analysis_bp
    from backend.app.api.impact import impact_bp
    from backend.app.api.findings import findings_bp
    from backend.app.api.janitor import janitor_bp
    from backend.app.api.seed import seed_bp
    from backend.app.api.github import github_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(repos_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(impact_bp)
    app.register_blueprint(findings_bp)
    app.register_blueprint(janitor_bp)
    app.register_blueprint(seed_bp)
    app.register_blueprint(github_bp)

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

    return app
