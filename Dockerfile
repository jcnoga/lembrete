# Usa uma imagem leve do Node.js
FROM node:18-slim

# Cria a pasta de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de configuração de dependências
COPY package*.json ./

# Instala as dependências do projeto
RUN npm install --production

# Copia todo o resto do código para dentro do container
COPY . .

# Define a porta padrão (o Cloud Run exige isso)
ENV PORT 8080

# Inicia o servidor
CMD [ "npm", "start" ]
