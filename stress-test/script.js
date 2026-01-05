import http from 'k6/http';
import { sleep } from 'k6';

const virtualUsersCount = 1000;

export const options = {
  vus: virtualUsersCount,
  duration: '5s',
};

export default function () {
  http.get('http://host.docker.internal/api/users');
  sleep(1);
}
