# Iniciado por run.py / run.vbs
import sys
import os

# Garante que estamos na pasta do projeto (onde está o .env)
_here = os.path.dirname(os.path.abspath(__file__))
os.chdir(_here)

def main():
    try:
        print("Carregando Sistema de Comissoes Young...")
        import app
        port = int(os.getenv("FLASK_PORT", 5000))
        app.scheduler.start()
        print()
        print("=" * 50)
        print("  Servidor em: http://localhost:%d" % port)
        print("  Ou: http://127.0.0.1:%d" % port)
        print("=" * 50)
        print()
        app.app.run(debug=True, port=port, host="0.0.0.0")
    except Exception as e:
        import traceback
        print()
        print("=" * 60, file=sys.stderr)
        print("  ERRO AO INICIAR O SERVIDOR", file=sys.stderr)
        print("=" * 60, file=sys.stderr)
        print(str(e), file=sys.stderr)
        print(file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        print(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
