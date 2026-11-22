start powershell -NoExit -Command "mongod --dbpath C:\data\db"
timeout /t 3
start powershell -NoExit -Command "chroma run --host localhost --port 8000"
timeout /t 3
start powershell -NoExit -Command "cd 'E:\behavioral-twin\backend'; npm run dev"
timeout /t 5
start powershell -NoExit -Command "cd 'E:\behavioral-twin\frontend'; npm start"